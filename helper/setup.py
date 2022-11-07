from setuptools import setup, find_packages

setup(
    name='scrapyard_server',
    version='2.1',
    packages=find_packages(),
    url='',
    license='',
    author='gchristnsn',
    author_email='gchristnsn@gmail.com',
    description='',
    install_requires=['Flask', 'bs4', 'regex'],
    entry_points={
        'console_scripts': ['scrapyard_server=scrapyard.helper:main'],
    },
    package_data={
        '': ['resources/*', 'resources/*/*']
    }
)
